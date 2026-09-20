import type { User } from '@prisma/client';

// codeHash (hash bcrypt du PIN) ne doit jamais quitter le serveur.
export function serializeUser(u: User) {
  return {
    id: u.id,
    nom: u.nom,
    telephone: u.telephone,
    role: u.role,
    // Le propriétaire a tous les droits sans qu'aucun soit coché : on ne
    // renvoie donc que la liste réellement accordée, l'UI traite le cas OWNER.
    permissions: u.permissions,
    actif: u.actif,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function serializeUserList(users: User[]) {
  return users.map(serializeUser);
}
