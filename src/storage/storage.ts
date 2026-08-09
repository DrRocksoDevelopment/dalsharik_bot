export interface Identifiable {
  id: string;
}

export interface Storage<T extends Identifiable> {
  get(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  find(predicate: (item: T) => boolean): Promise<T[]>;
  insert(item: T): Promise<void>;
  update(id: string, patch: Partial<T>): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}
