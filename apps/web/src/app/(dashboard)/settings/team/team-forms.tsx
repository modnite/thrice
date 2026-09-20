"use client";

import { useActionState } from "react";
import {
  addMemberAction,
  removeMemberAction,
  resetMemberPasswordAction,
  setMemberRoleAction,
  type TeamState,
} from "./actions";

import { useNoResetForm } from "@/lib/use-no-reset-form";

const initial: TeamState = {};

function Feedback({ state }: { state: TeamState }) {
  if (state.error) return <p className="text-xs text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-xs text-green-700">{state.message}</p>;
  return null;
}

export function AddMemberForm({ canAddPrivileged }: { canAddPrivileged: boolean }) {
  const [state, action, pending] = useActionState(addMemberAction, initial);
  const formProps = useNoResetForm(action, state, true);
  return (
    <form {...formProps} className="card max-w-2xl space-y-3">
      <h2 className="font-semibold">Add a team member</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" placeholder="Name" className="input" />
        <input name="email" type="email" placeholder="Email" required className="input" />
        <select name="role" defaultValue="STAFF" className="input">
          <option value="STAFF">Staff (orders and inventory)</option>
          {canAddPrivileged && <option value="ADMIN">Admin (also catalog and settings)</option>}
          {canAddPrivileged && <option value="OWNER">Owner (everything, including team)</option>}
        </select>
        <input name="password" type="text" autoComplete="off" placeholder="Temporary password (12+ characters)" className="input" />
      </div>
      <p className="text-xs text-neutral-500">
        If the email already has an account, they are simply given access and the name and password are ignored.
      </p>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Adding..." : "Add member"}
      </button>
    </form>
  );
}

export function MemberControls({
  membershipId,
  role,
  isSelf,
  canManage,
  canGrantPrivileged,
}: {
  membershipId: string;
  role: "OWNER" | "ADMIN" | "STAFF";
  isSelf: boolean;
  canManage: boolean;
  canGrantPrivileged: boolean;
}) {
  const [roleState, roleAction] = useActionState(setMemberRoleAction.bind(null, membershipId), initial);
  const [pwState, pwAction, pwPending] = useActionState(resetMemberPasswordAction.bind(null, membershipId), initial);
  const [rmState, rmAction] = useActionState(removeMemberAction.bind(null, membershipId), initial);

  if (!canManage) return <span className="text-xs text-neutral-400">No changes allowed</span>;

  return (
    <div className="space-y-2">
      <form action={roleAction} className="flex items-center gap-2">
        <select
          name="role"
          defaultValue={role}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="input w-32 py-1 text-xs"
        >
          <option value="STAFF">Staff</option>
          {(canGrantPrivileged || role === "ADMIN") && <option value="ADMIN">Admin</option>}
          {(canGrantPrivileged || role === "OWNER") && <option value="OWNER">Owner</option>}
        </select>
        {!isSelf && (
          <button
            type="submit"
            formAction={rmAction}
            onClick={(e) => {
              if (!confirm("Remove this person's access to the store?")) e.preventDefault();
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Remove
          </button>
        )}
      </form>
      {!isSelf && (
        <form action={pwAction} className="flex items-center gap-2">
          <input name="password" type="text" autoComplete="off" placeholder="New temporary password" className="input w-48 py-1 text-xs" />
          <button type="submit" disabled={pwPending} className="btn py-1 text-xs">
            Reset password
          </button>
        </form>
      )}
      <Feedback state={roleState} />
      <Feedback state={pwState} />
      <Feedback state={rmState} />
    </div>
  );
}
