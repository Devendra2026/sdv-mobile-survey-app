import { api } from '@/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

export type UserItem = FunctionReturnType<typeof api.admin.listUsers>['page'][number];

export const ROLE_FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'surveyor', label: 'Surveyors' },
  { value: 'supervisor', label: 'Supervisors' },
  { value: 'admin', label: 'Admins' },
  { value: 'pending', label: 'Pending' },
] as const;
