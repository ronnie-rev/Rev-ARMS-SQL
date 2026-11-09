import type { TableName } from '../types';
export type Row = Record<string, any>;
export interface DB {
  mode: 'local' | 'supabase';
  /** server-side atomic helpers (Supabase RPC); the local demo store does not implement it */ rpc?(name: string, args: Record<string, any>): Promise<any>;
  list(table: TableName): Promise<Row[]>;
  find(table: TableName, where?: Record<string, any>, opts?: { order?: string; desc?: boolean; limit?: number }): Promise<Row[]>;
  upsert(table: TableName, rows: Row[], onConflict?: string): Promise<void>;
  update(table: TableName, ids: string[], patch: Row): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  subscribe?(cb: (table: TableName, evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Row) => void): () => void;
}
