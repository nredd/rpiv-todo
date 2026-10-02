import { STATE_ENTRY_TYPE, type TaskDetails, type TaskSnapshot } from "../tool/types.js";
import { EMPTY_STATE, type TaskState } from "./state.js";

/**
 * Discriminator for `details` envelopes that match the persisted `TaskDetails`
 * shape. Defensive — branch entries from older or corrupt sessions are
 * skipped silently.
 */
export function isTaskDetails(value: unknown): value is TaskDetails {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return Array.isArray(v.tasks) && typeof v.nextId === "number";
}

/** Snapshot carried by a branch entry: a `todo` tool result, or a `rpiv-todo-state` custom entry. */
function snapshotOf(entry: unknown): TaskSnapshot | undefined {
	const e = entry as {
		type?: string;
		customType?: string;
		data?: unknown;
		message?: { role?: string; toolName?: string; details?: unknown };
	};
	if (e.type === "custom" && e.customType === STATE_ENTRY_TYPE) {
		return isTaskDetails(e.data) ? e.data : undefined;
	}
	if (e.type !== "message") return undefined;
	const msg = e.message;
	if (msg?.role !== "toolResult" || msg.toolName !== "todo") return undefined;
	return isTaskDetails(msg.details) ? msg.details : undefined;
}

/**
 * Walk the current branch in chronological order; the LAST snapshot wins
 * (last-write-wins). Snapshots are `todo` tool results whose `details` match
 * `TaskDetails`, and `rpiv-todo-state` custom entries written when a plan
 * approval changes the list outside a tool call. When none exists, returns
 * `EMPTY_STATE`.
 *
 * Pure of module state — `index.ts` writes the returned snapshot into the
 * store after this returns. The function explicitly does NOT touch the store
 * cell.
 */
export function replayFromBranch(ctx: { sessionManager: { getBranch(): Iterable<unknown> } }): TaskState {
	let result: TaskState = { tasks: [...EMPTY_STATE.tasks], nextId: EMPTY_STATE.nextId };
	for (const entry of ctx.sessionManager.getBranch()) {
		const details = snapshotOf(entry);
		if (!details) continue;
		result = {
			tasks: details.tasks.map((t) => ({ ...t })),
			nextId: details.nextId,
			...(details.plan ? { plan: { ...details.plan } } : {}),
		};
	}
	return result;
}
