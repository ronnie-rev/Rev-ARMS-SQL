import type { Claim, Client, Profile } from '../types';
import type { Bucket } from '../utils';

export interface EClaim {
  c: Claim; client: Client | undefined; age: number | null; bucket: Bucket | null; tfLeft: number | null; score: number;
  stage?: string; stageColor?: string; patientAR?: boolean; lifecycle?: string; family?: string; visit?: string; tags?: string[]; snoozed?: boolean; linked?: number;
  terminal: boolean; open: boolean; owner: Profile | undefined; fuDue: boolean; stale: boolean;
}
