import { mutation } from "./_generated/server";

export const renameNightslipToNames = mutation({
  args: {},
  handler: async ({ db }) => {
    const lists = await db.query("appendLists").collect();
    let updated = 0;
    const now = Date.now();

    for (const list of lists) {
      if ((list.listType as string | undefined) === "nightslip") {
        await db.patch(list._id, {
          listType: "names",
          updatedAt: now,
        });
        updated += 1;
      }
    }

    return { updated, total: lists.length };
  },
});
