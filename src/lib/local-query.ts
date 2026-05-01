export type Filter =
  | { type: "eq"; column: string; value: unknown }
  | { type: "neq"; column: string; value: unknown }
  | { type: "in"; column: string; values: unknown[] }
  | { type: "is"; column: string; value: unknown }
  | { type: "gte"; column: string; value: unknown }
  | { type: "lte"; column: string; value: unknown }
  | { type: "gt"; column: string; value: unknown }
  | { type: "lt"; column: string; value: unknown }
  | { type: "like"; column: string; value: unknown; caseInsensitive?: boolean }
  | { type: "or"; expression: string };

export type Order = { column: string; ascending: boolean; nullsFirst?: boolean };

export type LocalQueryPayload = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  columns?: string;
  values?: unknown;
  filters: Filter[];
  orders: Order[];
  limitCount?: number;
  offsetCount?: number;
  singleMode?: "single" | "maybeSingle" | null;
  count?: "exact" | null;
  head?: boolean;
  onConflict?: string;
};

export type LocalQueryResult<T = any> = {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
};

type Executor = (payload: LocalQueryPayload) => Promise<LocalQueryResult<any>>;

type StorageApi = {
  from(bucket: string): {
    upload(path: string, file: File | Blob, options?: Record<string, unknown>): Promise<LocalQueryResult<{ path: string }>>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
    remove(paths: string[]): Promise<LocalQueryResult<{ paths: string[] }>>;
  };
};

type RpcFn = (name: string, args?: Record<string, unknown>) => Promise<LocalQueryResult<any[]>>;

export class LocalQueryBuilder<T = any> implements PromiseLike<LocalQueryResult<T>> {
  private payload: LocalQueryPayload;
  private executor: Executor;

  constructor(table: string, executor: Executor) {
    this.executor = executor;
    this.payload = {
      table,
      action: "select",
      filters: [],
      orders: [],
      singleMode: null,
      count: null,
      head: false,
    };
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    this.payload.columns = columns;
    this.payload.count = options?.count ?? null;
    this.payload.head = Boolean(options?.head);
    return this;
  }

  insert(values: unknown): this {
    this.payload.action = "insert";
    this.payload.values = values;
    return this;
  }

  update(values: unknown): this {
    this.payload.action = "update";
    this.payload.values = values;
    return this;
  }

  delete(): this {
    this.payload.action = "delete";
    return this;
  }

  upsert(values: unknown, options?: { onConflict?: string }): this {
    this.payload.action = "upsert";
    this.payload.values = values;
    this.payload.onConflict = options?.onConflict;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.payload.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.payload.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.payload.filters.push({ type: "in", column, values });
    return this;
  }

  is(column: string, value: unknown): this {
    this.payload.filters.push({ type: "is", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.payload.filters.push({ type: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.payload.filters.push({ type: "lte", column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.payload.filters.push({ type: "gt", column, value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.payload.filters.push({ type: "lt", column, value });
    return this;
  }

  like(column: string, value: unknown): this {
    this.payload.filters.push({ type: "like", column, value, caseInsensitive: false });
    return this;
  }

  ilike(column: string, value: unknown): this {
    this.payload.filters.push({ type: "like", column, value, caseInsensitive: true });
    return this;
  }

  or(expression: string): this {
    this.payload.filters.push({ type: "or", expression });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.payload.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(count: number): this {
    this.payload.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.payload.offsetCount = Math.max(0, from);
    this.payload.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  single(): this {
    this.payload.singleMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.payload.singleMode = "maybeSingle";
    return this;
  }

  then<TResult1 = LocalQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: LocalQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.executor(this.payload).then(onfulfilled, onrejected);
  }
}

export function createLocalQueryClient(executor: Executor, storage?: StorageApi, rpcFn?: RpcFn) {
  return {
    from(table: string) {
      return new LocalQueryBuilder(table, executor);
    },
    channel(_name: string) {
      return {
        on(..._args: any[]) {
          return this;
        },
        subscribe(..._args: any[]) {
          return this;
        },
      };
    },
    removeChannel(_channel: unknown) {
      return Promise.resolve({ error: null });
    },
    auth: {
      async signInWithOtp(_args: unknown) {
        return { data: null, error: { message: "SMS auth o‘chirilgan. Telegram Login yoki TMA ishlatiladi." } };
      },
      async verifyOtp(_args: unknown) {
        return { data: null, error: { message: "SMS auth o‘chirilgan. Telegram Login yoki TMA ishlatiladi." } };
      },
    },
    storage: storage ?? createNoopStorage(),
    async rpc(name: string, args?: Record<string, unknown>) {
      if (!rpcFn) return { data: [], error: null };
      return rpcFn(name, args);
    },
  };
}

function createNoopStorage(): StorageApi {
  return {
    from(bucket: string) {
      return {
        async upload(path: string, _file: File | Blob, _options?: Record<string, unknown>) {
          return { data: { path }, error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `/uploads/${encodeURIComponent(bucket)}/${path}` } };
        },
        async remove(paths: string[]) {
          return { data: { paths }, error: null };
        },
      };
    },
  };
}
