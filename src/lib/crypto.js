'use strict';

/* ============================================================
   Cifrado simétrico (AES-256-GCM) para datos sensibles en reposo —
   descriptores de rostro y campos personales de empleados de RRHH.
   HTTPS ya protege el viaje de los datos, y Neon cifra el disco a
   nivel de infraestructura; esto agrega una capa más: ni con las
   credenciales de la base alguien puede leer estos valores sin
   además tener ENCRYPTION_KEY (que solo vive como variable de
   entorno, nunca en el repositorio).

   Formato del blob guardado (todo en un solo string base64):
   [ 12 bytes IV ][ 16 bytes auth tag ][ N bytes ciphertext ]
   ============================================================ */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey = null;
function getKey() {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('Falta ENCRYPTION_KEY en las variables de entorno — hace falta para cifrar/descifrar datos sensibles');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY inválida: debe decodificar a 32 bytes en base64');
  }
  cachedKey = key;
  return key;
}

/* Cifra un valor (string, o cualquier cosa que se pueda pasar por
   String()) — null/undefined pasan sin tocar, así un campo vacío
   sigue siendo NULL en la base en vez de convertirse en "cifrado de
   nada". */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/* Descifra un blob generado por encrypt(). Si el valor no es un
   blob válido (dato corrupto, cifrado con otra llave, o texto plano
   que quedó de antes de migrar) devuelve null en vez de tirar abajo
   toda la respuesta por un solo campo. */
function decrypt(blob) {
  if (blob === null || blob === undefined || blob === '') return blob === '' ? '' : null;
  try {
    const key = getKey();
    const buf = Buffer.from(blob, 'base64');
    if (buf.length < IV_LENGTH + TAG_LENGTH) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
