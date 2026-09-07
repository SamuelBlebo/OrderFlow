import { orderBy, query } from 'firebase/firestore';
import { customersRef } from '@/firebase';

export const customersQuery = (orgId: string) =>
  query(customersRef(orgId), orderBy('lastOrderAt', 'desc'));
