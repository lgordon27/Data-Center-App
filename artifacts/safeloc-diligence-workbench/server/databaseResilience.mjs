const protectedClients = new WeakMap();
const protectedPools = new WeakSet();
const databaseErrors = new WeakSet();
export const DATABASE_POOL_SETTINGS = Object.freeze({
  connectionTimeoutMillis: 2_000,
  idleTimeoutMillis: 10_000,
});

export function isDatabaseConnectionError(error) {
  const code = String(error?.code ?? "");
  return /^08[A-Z0-9]{3}$/.test(code)
    || ["57P01", "57P02", "57P03", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT"].includes(code)
    || /terminating connection|connection terminated|connection reset|connection timeout|connection timed out|timeout exceeded when trying to connect|query read timeout/i.test(String(error?.message ?? ""));
}

export function logDatabaseConnectionError(error, scope = "connection", logger = console) {
  // Never log the message, stack, connection string, SQL, or parameter values.
  logger.warn("SafeLoc database connection unavailable.", {
    scope,
    code: /^[A-Z0-9_]{2,20}$/.test(String(error?.code ?? "")) ? error.code : "connection-error",
  });
}

export function protectDatabaseClient(client, logger = console) {
  if (protectedClients.has(client)) return client;
  const state = { failed: false, release: null };
  protectedClients.set(client, state);
  client.on("error", (error) => {
    if (error && typeof error === "object") databaseErrors.add(error);
    state.failed = true;
    logDatabaseConnectionError(error, "client", logger);
    // Checked-out clients have no pg-pool idle listener. Destroy them now,
    // including the intentionally held advisory-lock session.
    state.release?.(true);
  });
  return client;
}

function prepareCheckout(client, logger) {
  protectDatabaseClient(client, logger);
  const state = protectedClients.get(client);
  const originalRelease = client.release.bind(client);
  let released = false;
  const release = (error) => {
    if (released) return;
    released = true;
    state.release = null;
    originalRelease(error || state.failed);
  };
  state.release = release;
  client.release = release;
  if (state.failed) release(true);
  return client;
}

export function protectDatabasePool(pool, logger = console) {
  if (protectedPools.has(pool)) return pool;
  protectedPools.add(pool);
  pool.on("error", (error) => logDatabaseConnectionError(error, "pool", logger));
  // pg emits connect before handing the client to either query() or connect().
  pool.on("connect", (client) => protectDatabaseClient(client, logger));
  const connect = pool.connect.bind(pool);
  pool.connect = function(callback) {
    if (typeof callback === "function") {
      return connect((error, client) => {
        if (error) return callback(error);
        const checkedOut = prepareCheckout(client, logger);
        callback(null, checkedOut, checkedOut.release);
      });
    }
    return connect().then((client) => prepareCheckout(client, logger));
  };
  return pool;
}

export function installDatabaseSafetyNet(target = process, logger = console) {
  const onUncaught = (error) => {
    const fromPg = databaseErrors.has(error)
      || /(?:[/\\]pg(?:-protocol|-pool)?[/\\]|[/\\]pg@|[/\\]pg-protocol@)/.test(String(error?.stack ?? ""));
    if (fromPg && isDatabaseConnectionError(error)) {
      logDatabaseConnectionError(error, "process-safety-net", logger);
      return;
    }
    // An uncaught programming exception leaves the process unsafe. Do not
    // generalize database resilience into an application-wide exception sink.
    logger.error("SafeLoc fatal unexpected server error.");
    target.exit(1);
  };
  target.on("uncaughtException", onUncaught);
  return () => target.removeListener("uncaughtException", onUncaught);
}

export async function retryDatabaseConnectionOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
    return operation();
  }
}

export async function boundedAuditOperation(operation, timeoutMs = 2_000) {
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error("Database audit connection timeout.");
          error.code = "ETIMEDOUT";
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
