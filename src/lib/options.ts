import { db } from "./db";
import {
  STAFF_NAMES,
  STATUSES,
  ACTIVITY_CATEGORIES,
  COMMON_SENDERS,
} from "./constants";

export type OptionCategory = "assignedTo" | "status" | "activityCategory" | "sender";

const DEFAULTS: Record<OptionCategory, readonly string[]> = {
  assignedTo: STAFF_NAMES,
  status: STATUSES,
  activityCategory: ACTIVITY_CATEGORIES,
  sender: COMMON_SENDERS,
};

/**
 * Get dropdown options for a category from the database.
 * Falls back to hardcoded defaults if no options exist in the DB.
 */
export async function getOptions(category: OptionCategory): Promise<string[]> {
  const dbOptions = await db.dropdownOption.findMany({
    where: { category },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { value: true },
  });
  if (dbOptions.length > 0) {
    return dbOptions.map((o) => o.value);
  }
  // Fall back to defaults
  return [...DEFAULTS[category]];
}

/**
 * Get all dropdown options for all categories at once.
 * Returns an object with arrays for each category.
 */
export async function getAllOptions(): Promise<{
  assignedTo: string[];
  status: string[];
  activityCategory: string[];
  sender: string[];
}> {
  const [assignedTo, status, activityCategory, sender] = await Promise.all([
    getOptions("assignedTo"),
    getOptions("status"),
    getOptions("activityCategory"),
    getOptions("sender"),
  ]);
  return { assignedTo, status, activityCategory, sender };
}

/**
 * Ensure default options are seeded into the database.
 * Called on first deploy. Only seeds if no options exist for the category.
 */
export async function seedDefaultOptions(): Promise<void> {
  for (const [category, defaults] of Object.entries(DEFAULTS)) {
    const count = await db.dropdownOption.count({ where: { category } });
    if (count === 0) {
      await db.dropdownOption.createMany({
        data: defaults.map((value, index) => ({
          category,
          value,
          sortOrder: index,
        })),
      });
    }
  }
}
