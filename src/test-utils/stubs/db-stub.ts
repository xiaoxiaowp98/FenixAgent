// raw db stub 注册表
// 替代各测试文件中的 mock.module("../db", ...) 调用
// Drizzle 的 db 是链式查询构建器，直接用自定义对象替换

// biome-ignore lint/suspicious/noExplicitAny: Drizzle db 对象类型复杂，stub 用宽松类型
type DbStub = Record<string, any>;

let _dbStub: DbStub | null = null;

export function stubDb(db: DbStub) {
  _dbStub = db;
}

export function getDbStub(): DbStub {
  if (!_dbStub) throw new Error("db stub not configured, call stubDb() in beforeEach");
  return _dbStub;
}

export function resetDbStub() {
  _dbStub = null;
}
