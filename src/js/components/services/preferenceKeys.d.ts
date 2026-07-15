import type {
  ExtensionPreferenceKey,
  KnownPreferenceKey,
} from "../../types/events/base.js";

export function isKnownPreferenceKey(key: string): key is KnownPreferenceKey;
export function extensionPreferenceKey(key: string): ExtensionPreferenceKey;
