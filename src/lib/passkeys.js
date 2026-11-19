'use strict';

/* ============================================================
   Passkeys (WebAuthn / FIDO2)
   Ingreso sin contraseña ni código 2FA: el celular (vía QR + Bluetooth)
   o Windows Hello firman un desafío con una clave privada que nunca
   sale del dispositivo. La passkey ya cuenta como dos factores
   (algo que tienes + huella/PIN), por eso no se pide el TOTP.

   - Las passkeys quedan atadas al dominio del login central (RP ID):
     se registran y se usan solo en qubira-login.vercel.app (o
     localhost en desarrollo).
   - Los desafíos viven en la base (no en memoria) y son de un solo
     uso, válidos 5 minutos.
   ============================================================ */

const crypto = require('crypto');
const { pool } = require('../db');

const CHALLENGE_TTL_MINUTES = 5;
const MAX_PASSKEYS_PER_USER = 10;
const SESSION_HOURS = parseInt(process.env.PASSKEY_SESSION_HOURS, 10) || 2;

/* Orígenes desde donde se permite registrar/usar passkeys. En
   producción solo el login central; en desarrollo cualquier puerto de
   localhost (WebAuthn no acepta IPs como 127.0.0.1). */
const PROD_ORIGINS = (process.env.WEBAUTHN_ORIGINS || 'https://qubira-login.vercel.app')
  .split(',').map(o => o.trim()).filter(Boolean);

function rpFromOrigin(origin) {
  if (!origin) return null;
  let url;
  try { url = new URL(origin); } catch { return null; }
  if (PROD_ORIGINS.includes(url.origin)) return { origin: url.origin, rpID: url.hostname };
  if (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && url.hostname === 'localhost') {
    return { origin: url.origin, rpID: 'localhost' };
  }
  return null;
}

let schemaPromise = null;
function ensurePasskeySchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE SCHEMA IF NOT EXISTS security;

      CREATE TABLE IF NOT EXISTS security.passkeys (
        id            BIGSERIAL PRIMARY KEY,
        usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key    TEXT NOT NULL,
        counter       BIGINT NOT NULL DEFAULT 0,
        transports    TEXT[],
        device_type   TEXT,
        backed_up     BOOLEAN,
        nombre        TEXT,
        rp_id         TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at  TIMESTAMPTZ,
        last_used_ip  TEXT
      );
      CREATE INDEX IF NOT EXISTS passkeys_usuario_idx ON security.passkeys (usuario_id);

      -- Con qué se inició cada sesión ('passkey' o NULL = contraseña/rostro).
      -- Una sesión por passkey ya probó 2 factores: el hub no vuelve a pedir el 2FA.
      ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS metodo TEXT;

      CREATE TABLE IF NOT EXISTS security.webauthn_challenges (
        id         TEXT PRIMARY KEY,
        challenge  TEXT NOT NULL,
        tipo       TEXT NOT NULL,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        rp_id      TEXT NOT NULL,
        origin     TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `).catch(err => { schemaPromise = null; throw err; });
  }
  return schemaPromise;
}

async function saveChallenge({ challenge, tipo, userId = null, rp }) {
  const id = crypto.randomBytes(18).toString('base64url');
  const expires = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);
  // Limpieza oportunista de desafíos vencidos
  await pool.query('DELETE FROM security.webauthn_challenges WHERE expires_at < NOW()');
  await pool.query(
    `INSERT INTO security.webauthn_challenges (id, challenge, tipo, usuario_id, rp_id, origin, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, challenge, tipo, userId, rp.rpID, rp.origin, expires]
  );
  return id;
}

/* Un solo uso: se borra al leerlo, haya salido bien o no la verificación. */
async function consumeChallenge(id, tipo) {
  if (!id || typeof id !== 'string') return null;
  const { rows } = await pool.query(
    `DELETE FROM security.webauthn_challenges
     WHERE id = $1 AND tipo = $2 AND expires_at > NOW()
     RETURNING challenge, usuario_id, rp_id, origin`,
    [id, tipo]
  );
  return rows[0] || null;
}

async function listPasskeys(userId) {
  const { rows } = await pool.query(
    `SELECT id, nombre, device_type, backed_up, transports, created_at, last_used_at
     FROM security.passkeys WHERE usuario_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function credentialsOfUser(userId) {
  const { rows } = await pool.query(
    'SELECT credential_id, transports FROM security.passkeys WHERE usuario_id = $1',
    [userId]
  );
  return rows.map(r => ({ id: r.credential_id, transports: r.transports || undefined }));
}

async function findByCredentialId(credentialId) {
  const { rows } = await pool.query('SELECT * FROM security.passkeys WHERE credential_id = $1', [credentialId]);
  return rows[0] || null;
}

module.exports = {
  CHALLENGE_TTL_MINUTES, MAX_PASSKEYS_PER_USER, SESSION_HOURS,
  rpFromOrigin, ensurePasskeySchema, saveChallenge, consumeChallenge,
  listPasskeys, credentialsOfUser, findByCredentialId,
};
