'use strict';

const { getEmployeeArea } = require('./employeeArea');
const { getGrantedModules } = require('./security');

/* Módulos reconocidos por el flujo central de login. COMERCIAL está
   registrado aunque QUBIRA_COMERCIAL todavía no tiene código propio —
   así el dashboard y el control de acceso ya quedan listos para cuando
   exista. DST (el panel de seguridad) es un módulo más: no lo da
   ningún área real, así que solo se obtiene por nivel_acceso>=100 o
   por un otorgamiento explícito vía security.usuario_modulos — pero
   una vez otorgado, cuenta igual que cualquier otro módulo (aparece en
   modulo.html y pasa requireModuleAccess('DST') normalmente). Quién
   puede otorgarlo sigue estando restringido: POST
   /api/security/permissions/:userId exige nivel_acceso>=100 o, ya
   dentro de DST, tener el módulo DST otorgado (ver requirePrivileged
   en routes/security.js). */
const MODULES = ['TI', 'ADG', 'RRHH', 'SOPORTE', 'COMERCIAL', 'DST'];

/* Módulos que un usuario tiene autorizados:
   - nivel_acceso>=100 (CEO/superadmin): todos, incluido DST.
   - si no: el módulo que da su área real (como antes) UNIDO a los
     módulos otorgados explícitamente vía security.usuario_modulos
     (ej. Abraham es de TI pero además le dieron SOPORTE, ADG y DST). */
async function getAuthorizedModules(username, nivelAcceso, userId) {
  if (nivelAcceso >= 100) return [...MODULES];
  const [area, granted] = await Promise.all([
    getEmployeeArea(username),
    userId ? getGrantedModules(userId) : Promise.resolve([]),
  ]);
  const set = new Set(granted.filter(m => MODULES.includes(m)));
  if (area && MODULES.includes(area)) set.add(area);
  return [...set];
}

/* Middleware: exige que el usuario autenticado tenga autorizado
   alguno de los módulos indicados. ti.js sirve tanto a TI como a ADG
   (mismo backend, dos paneles), por eso admite varios valores. */
function requireModuleAccess(...modulos) {
  return async (req, res, next) => {
    try {
      const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
      if (!modulos.some(m => authorized.includes(m))) {
        return res.status(403).json({ error: 'Tu cuenta no tiene acceso a este módulo' });
      }
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { MODULES, getAuthorizedModules, requireModuleAccess };
