import changelogText from '../../CHANGELOG.md';

/** Версія застосунку з package.json (підставляється під час збирання). */
export const VERSION: string = __APP_VERSION__;

/** Текст CHANGELOG.md — джерело сторінки «Що нового». */
export const CHANGELOG: string = changelogText;
