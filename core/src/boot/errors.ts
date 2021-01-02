// Define minimal types for GraalVM polyglot exception API

import { Path } from 'java.nio.file';

// Avoid using require(), it is not loaded yet
// require.ts loads this into same namespace
declare const PathType: typeof Path;

// Most methods and fields will be missing
declare class JsError {
  readonly name: string;
  readonly message: string | null;
  readonly stack: FrameInfo[];
}

declare class FrameInfo {
  readonly javaFrame: boolean;
  readonly plugin: string;
  readonly source: string;
  readonly methodName: string;
  readonly fileName: string;
  readonly line: number;
}

const showAllFrames = __interop.systemProperty('craftjs.trace.allFrames');

/**
 * JS sources that should be hidden from stack traces.
 */
const hiddenScripts = new Set([
  'entrypoint', // Special name set by CraftJS Java code
  'dist/boot/errors.js',
  'dist/boot/require.js',
  'dist/boot/sourcemap.js',
]);
const hiddenClasses = new Set([
  'fi.valtakausi.craftjs.api.CraftJsContext',
  'fi.valtakausi.craftjs.api.JavaInterop',
  'org.graalvm.polyglot.Context',
  'com.oracle.truffle.polyglot.FunctionProxyHandler',
]);

/**
 * Checks if the given frame should be emitted in stack trace.
 * @param frame Frame to check
 */
function shouldEmitFrame(frame: FrameInfo): boolean {
  if (showAllFrames) {
    return true;
  }
  if (frame.javaFrame) {
    if (hiddenClasses.has(frame.source)) {
      return false;
    } else if (frame.source.startsWith('com.sun.proxy')) {
      return false;
    }
  } else {
    if (hiddenScripts.has(frame.source)) {
      return false;
    }
  }
  return true;
}

/**
 * Formats error for logging.
 * @param error The error.
 * @returns Error message, including stack trace.
 */
function formatError(error: JsError): string {
  // Try to format error name and message
  let text = error.name;
  if (error.message) {
    text += `: ${error.message}\n`;
  } else {
    text += '\n';
  }

  for (const frame of error.stack) {
    // Filter out internal and usually unnecessary frames
    if (!shouldEmitFrame(frame)) {
      continue;
    }

    // Figure out original source file and line
    let line: SourceLine;
    let fileName: string;
    if (frame.javaFrame) {
      line = { file: frame.source, line: frame.line };
      fileName = frame.fileName;
    } else {
      if ('mapLineToSource' in globalThis) {
        line = mapLineToSource(frame.plugin, frame.source, frame.line);

        // line.file is relative path to JS file under dist
        // Normalize and relativize it against plugin root
        const pluginRoot = __craftjs.getPluginRoot(frame.plugin);
        const distDir = pluginRoot.resolve('dist');
        line.file = pluginRoot
          .relativize(distDir.resolve(line.file).normalize())
          .toString();

        // If we somehow didn't get rid of ../ at beginning, strip it out
        if (line.file.startsWith('../')) {
          line.file = line.file.substring(3);
        }

        fileName = line.file.split('/').pop() ?? frame.fileName;
      } else {
        // Error occurred during early startup
        log.warn('Error in early startup, source maps do not work');
        line = { file: frame.source, line: frame.line };
        fileName = frame.fileName;
      }
    }
    text += `        at ${line.file} ${frame.methodName}(${fileName}:${line.line}) [${frame.plugin}]\n`;
  }
  return text;
}

function handleError(func: () => void, msg: string): boolean {
  const error = __interop.catchError(func);
  if (error) {
    log.error(msg);
    log.error(formatError(error));
    return true;
  } else {
    return false;
  }
}
globalThis.handleError = handleError;

declare global {
  /**
   * Catches and logs an error.
   * @param func Function that might throw an error.
   * @param msg Message to log above the error.
   * @returns If an error occurred.
   */
  function handleError(func: () => void, msg: string): boolean;
}
