export type SkillValue = string | { name?: unknown };

const skillKey = (skill: SkillValue): string =>
  String(typeof skill === 'object' && skill !== null ? skill.name ?? '' : skill)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]/g, '');

/**
 * Preserve skills added by another writer after this page loaded while still
 * respecting skills deliberately removed from the page's original list.
 */
export const mergeConcurrentSkills = <T extends SkillValue>(
  baseline: T[],
  local: T[],
  remote: T[],
): T[] => {
  const baselineKeys = new Set(baseline.map(skillKey).filter(Boolean));
  const localKeys = new Set(local.map(skillKey).filter(Boolean));
  const addedElsewhere = remote.filter((skill) => {
    const key = skillKey(skill);
    return key && !baselineKeys.has(key) && !localKeys.has(key);
  });

  return addedElsewhere.length ? [...local, ...addedElsewhere] : local;
};