type StatementCall = {
  sql: string;
  binds: unknown[];
};

const okResult = <T = Record<string, unknown>>(results: T[] = []): D1Result<T> =>
  ({
    success: true,
    meta: { changes: results.length },
    results
  }) as D1Result<T>;

class MockPreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly db: MockD1Database,
    readonly sql: string,
    readonly binds: unknown[] = []
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new MockPreparedStatement(this.db, this.sql, values);
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    this.db.firstCalls.push({ sql: this.sql, binds: this.binds });
    const queued = this.db.firstQueue.shift();
    if (queued === undefined || queued === null) {
      return null;
    }
    if (colName) {
      const value = (queued as Record<string, unknown>)[colName];
      return (value as T | undefined) ?? null;
    }
    return queued as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.db.runCalls.push({ sql: this.sql, binds: this.binds });
    return (this.db.runQueue.shift() as D1Result<T> | undefined) ?? okResult<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    this.db.allCalls.push({ sql: this.sql, binds: this.binds });
    return (this.db.allQueue.shift() as D1Result<T> | undefined) ?? okResult<T>([]);
  }

  async raw<T = unknown[]>(
    _options?: {
      columnNames?: boolean;
    }
  ): Promise<T[] | [string[], ...T[]]> {
    return [] as T[];
  }
}

export class MockD1Database implements D1Database {
  readonly runCalls: StatementCall[] = [];
  readonly allCalls: StatementCall[] = [];
  readonly firstCalls: StatementCall[] = [];
  readonly batchCalls: StatementCall[][] = [];

  readonly runQueue: unknown[] = [];
  readonly allQueue: unknown[] = [];
  readonly firstQueue: unknown[] = [];

  prepare(query: string): D1PreparedStatement {
    return new MockPreparedStatement(this, normalizeSql(query));
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const calls = statements.map((statement) => {
      const typed = statement as MockPreparedStatement;
      return {
        sql: typed.sql,
        binds: typed.binds
      };
    });
    this.batchCalls.push(calls);
    return calls.map(() => okResult<T>());
  }

  async exec(_query: string): Promise<D1ExecResult> {
    return { count: 0, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error('withSession not implemented in MockD1Database');
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}
