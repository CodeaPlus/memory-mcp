#!/usr/bin/env node
/**
 * install.mjs — Registra los hooks de memory skill en ~/.claude/settings.json
 *
 * Uso (una sola vez después de instalar el skill):
 *   node ~/.claude/skills/memory/install.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const SKILL_DIR   = dirname(fileURLToPath(import.meta.url));
const PROMPT_HOOK = join(SKILL_DIR, "hooks", "hook-prompt-submit.mjs");
const STOP_HOOK   = join(SKILL_DIR, "hooks", "hook-stop.mjs");

const CLAUDE_DIR    = join(homedir(), ".claude");
const SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

// ─── Leer settings existentes ─────────────────────────────────────────────────

if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true });

let settings = {};
if (existsSync(SETTINGS_PATH)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {
    console.error("⚠ No se pudo parsear settings.json — se creará uno nuevo.");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve true si el comando ya está registrado en los hooks del evento */
function alreadyRegistered(event, command) {
  return (settings.hooks?.[event] ?? []).some((group) =>
    (group.hooks ?? []).some((h) => h.command === command)
  );
}

/** Agrega el comando al evento si no existe todavía */
function addHook(event, command) {
  if (alreadyRegistered(event, command)) return false;
  settings.hooks ??= {};
  settings.hooks[event] ??= [];
  settings.hooks[event].push({ hooks: [{ type: "command", command }] });
  return true;
}

// ─── Registrar hooks ──────────────────────────────────────────────────────────

const cmd = (p) => `node ${p}`;

const addedPrompt = addHook("UserPromptSubmit", cmd(PROMPT_HOOK));
const addedStop   = addHook("Stop",             cmd(STOP_HOOK));

// ─── Guardar ──────────────────────────────────────────────────────────────────

writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));

if (addedPrompt || addedStop) {
  console.log("✓ Hooks de memory skill registrados en", SETTINGS_PATH);
  if (addedPrompt) console.log("  · UserPromptSubmit →", PROMPT_HOOK);
  if (addedStop)   console.log("  · Stop             →", STOP_HOOK);
  console.log("\nReinicia Claude Code para que los cambios surtan efecto.");
} else {
  console.log("✓ Los hooks ya estaban registrados — nada que hacer.");
}
