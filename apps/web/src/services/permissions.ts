/* A matriz de permissões vive em `@myhome/shared`, compartilhada
   com a API. Este arquivo apenas a reexporta para que os módulos
   do aplicativo sigam importando de `services/permissions`. */

export {
  ROLE_PERMISSIONS, ROLE_LABEL, ROLE_DESCRIPTION,
  permissionsFor, can, canAny,
} from '@myhome/shared';
