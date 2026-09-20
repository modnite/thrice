"use client";

import { reassignArticleAction } from "./actions";

export function ArticleSelect({
  orderId,
  lineId,
  currentArticleId,
  options,
}: {
  orderId: string;
  lineId: string;
  currentArticleId: string | null;
  options: { id: string; articleCode: string }[];
}) {
  const action = reassignArticleAction.bind(null, orderId, lineId);

  return (
    <form action={action} className="flex">
      <select
        name="articleId"
        defaultValue={currentArticleId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input w-full py-1 text-xs"
      >
        <option value="" disabled>
          Select serial
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.articleCode}
          </option>
        ))}
      </select>
    </form>
  );
}
