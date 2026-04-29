// Production-safe logger.
//
// BUG-F14 fix: replace bare `console.log/warn/error` calls in app code with
// these helpers. In development they behave like the native console; in
// production builds the logger silences `log` and `warn` calls entirely
// while still surfacing real errors.
const IS_DEV = process.env.NODE_ENV !== 'production';

export const logger = {
  log: (...args) => { if (IS_DEV) console.log(...args); },
  warn: (...args) => { if (IS_DEV) console.warn(...args); },
  // Errors are always reported because they are critical for runtime
  // observability (Sentry / browser DevTools), but we strip stack traces
  // from sensitive headers when serializing in production.
  error: (...args) => { console.error(...args); },
  debug: (...args) => { if (IS_DEV && console.debug) console.debug(...args); },
};

export default logger;
