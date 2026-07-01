/**
 * Module shim for midi-writer-js.
 *
 * The package's exports field lacks a "types" condition, so TypeScript
 * bundler-mode resolution can't locate the declarations automatically.
 * This file points to the correct .d.ts location.
 */
declare module 'midi-writer-js' {
  export { default } from '../node_modules/midi-writer-js/build/types/main';
}
