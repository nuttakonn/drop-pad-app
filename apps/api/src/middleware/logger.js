export const loggerMiddleware = async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    const start = Date.now();
    const { method, url } = c.req;
    await next();
    const ms = Date.now() - start;
    const status = c.res.status;
    const log = {
        timestamp: new Date().toISOString(),
        requestId,
        method,
        url,
        status,
        duration: `${ms}ms`,
        level: status >= 400 ? 'ERROR' : 'INFO'
    };
    console.log(JSON.stringify(log));
    c.header('X-Request-Id', requestId);
};
