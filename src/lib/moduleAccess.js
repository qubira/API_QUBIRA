'use strict';

const { getEmployeeArea } = require('./employeeArea');

/* Módulos reconocidos por el flujo central de login. COMERCIAL está
   registrado aunque QUBIRA_COMERCIAL todavía no tiene código propio —
   así el dashboard y el control de acceso ya quedan listos para cuando
   exista. */
const MODULES = ['TI', 'ADG', 'RRHH', 'SOPORTE', 'COMERCIAL'];

/* Módulos que un usuario tiene autorizados. Hoy: el área real del
   empleado (rrhh.empleados.area_trabajo_id) da UN módulo; nivel_acceso
   >= 100 (CEO/superadmin) da todos. Pensado para poder reemplazarse
   más adelante por una tabla usuario_modulos muchos-a-muchos sin
   cambiar la firma de esta función (Fase 2). */
async function getAuthorizedModules(username, nivelAcceso) {
  if (nivelAcceso >= 100) return [...MODULES];
  const area = await getEmployeeArea(username);
  return area && MODULES.includes(area) ? [area] : [];
}

/* Middleware: exige que el usuario autenticado tenga autorizado
   alguno de los módulos indicados. ti.js sirve tanto a TI como a ADG
   (mismo backend, dos paneles), por eso admite varios valores. */
function requireModuleAccess(...modulos) {
  return async (req, res, next) => {
    try {
      const authorized = await getAuthorizedModules(req.user.username, req.user.nivel_acceso);
      if (!modulos.some(m => authorized.includes(m))) {
        return res.status(403).json({ error: 'Tu cuenta no tiene acceso a este módulo' });
      }
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { MODULES, getAuthorizedModules, requireModuleAccess };
