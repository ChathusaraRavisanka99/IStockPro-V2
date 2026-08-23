import { UserRole } from "@prisma/client";

export function canViewCost(role: UserRole | undefined): boolean {
  return role === UserRole.admin || role === UserRole.manager;
}

export function canManageUsers(role: UserRole | undefined): boolean {
  return role === UserRole.admin;
}

export function canVoidInvoices(role: UserRole | undefined): boolean {
  return role === UserRole.admin || role === UserRole.manager;
}
