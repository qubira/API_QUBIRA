'use strict';

const { getEmployeeArea } = require('./employeeArea');
const { getGrantedModules } = require('./security');

/* Módulos reconocidos por el flujo central de login. COMERCIAL está
   registrado aunque QUBIRA_COMERCIAL todavía no tiene código propio —
   así el dashboard y el control de acceso ya quedan listos para cuando
   exista. DST es el panel de seguridad — se agrega al registro solo
   para que login/modulo.html lo muestre a quien califique; el gate
   real de entrada es nivel_acceso>=100 (ver requireModuleAccess más
   abajo), nunca un otorgamiento vía security.usuario_modulos. */
const MODULES = ['TI', 'ADG', 'RRHH', 'SOPORTE', 'COMERCIAL'];
const ALL_MODULES_INCLUDING_DST = [...MODULES, 'DST'];

/* Módulos que un usuario tiene autorizados:
   - nivel_acceso>=100 (CEO/superadmin): todos, incluido DST.
   - si no: el módulo que da su área real (como antes) UNIDO a los
     módulos otorgados explícitamente vía security.usuario_modulos
     (ej. Abraham es de TI pero además le dieron SOPORTE y ADG). */
async function getAuthorizedModules(username, nivelAcceso, userId) {
  if (nivelAcceso >= 100) return [...ALL_MODULES_INCLUDING_DST];
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
   (mismo backend, dos paneles), por eso admite varios valores.
   'DST' es especial: nunca se resuelve vía getAuthorizedModules, se
   exige nivel_acceso>=100 directamente (panel sensible, ver plan). */
function requireModuleAccess(...modulos) {
  return async (req, res, next) => {
    try {
      if (modulos.includes('DST')) {
        if (req.user.nivel_acceso >= 100) return next();
        return res.status(403).json({ error: 'Tu cuenta no tiene acceso a este módulo' });
      }
      const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso, req.user.id);
      if (!modulos.some(m => authorized.includes(m))) {
        return res.status(403).json({ error: 'Tu cuenta no tiene acceso a este módulo' });
      }
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { MODULES, ALL_MODULES_INCLUDING_DST, getAuthorizedModules, requireModuleAccess };
