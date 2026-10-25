import { describe, expect, test } from "bun:test";
import { loadSavedProfile } from "../supabase/functions/tailor-application/savedProfile";

function clientFor(data: any, error: any = null) {
  const filters: unknown[][] = [];
  const client = {
    from(table: string) {
      filters.push(["table", table]);
      return { select: () => ({ eq: (column: string, value: string) => {
        filters.push([column, value]);
        return { single: async () => ({ data, error }) };
      } }) };
    },
  };
  return { client, filters };
}

describe("latest saved profile evidence", () => {
  test("reads fresh work bullets on every call rather than a stale snapshot", async () => {
    const saved = { professional_experience: [{ title: "Software Engineer", bullets: ["Reduced processing time by 25%."] }] };
    const { client } = clientFor(saved);
    expect((await loadSavedProfile(client, "caller")).professionalExperience[0].bullets).toEqual(["Reduced processing time by 25%."]);
    saved.professional_experience = [{ title: "Software Engineer", bullets: ["Reduced processing time by 40%."] }];
    expect((await loadSavedProfile(client, "caller")).professionalExperience[0].bullets).toEqual(["Reduced processing time by 40%."]);
  });

  test("loads all document evidence and contact fields from saved Settings", async () => {
    const { client, filters } = clientFor({ first_name: "Max", last_name: "Okafor", email: "new@example.test", phone: "123", linkedin: "linkedin", github: "github", portfolio: "portfolio", cover_letter: "Saved wording", education: [{ degree: "BSc" }], skills: ["Python"], certifications: ["AWS"], achievements: ["Award"], ats_strategy: "Saved strategy", city: "Dublin", country: "Ireland", address: "Address", state: "County", zip_code: "Code", relevant_projects: [{ name: "Current project" }], languages: ["English"], citizenship: "Irish", work_authorized_countries: ["Ireland"], notice_period: "One month" });
    expect(await loadSavedProfile(client, "signed-in-user")).toEqual({ firstName: "Max", lastName: "Okafor", email: "new@example.test", phone: "123", linkedin: "linkedin", github: "github", portfolio: "portfolio", coverLetter: "Saved wording", professionalExperience: [], education: [{ degree: "BSc" }], skills: ["Python"], certificationsHidden: false, certifications: ["AWS"], achievements: ["Award"], atsStrategy: "Saved strategy", city: "Dublin", country: "Ireland", address: "Address", state: "County", zipCode: "Code", relevantProjects: [{ name: "Current project" }], languages: ["English"], citizenship: "Irish", workAuthorizedCountries: ["Ireland"], noticePeriod: "One month" });
    expect(filters).toEqual([["table", "profiles"], ["user_id", "signed-in-user"]]);
  });

  test("removed evidence and hidden certifications are not restored", async () => {
    const { client } = clientFor({ professional_experience: [], relevant_projects: [], skills: [], certifications: ["AWS"], certifications_hidden: true });
    const profile = await loadSavedProfile(client, "caller");
    expect(profile.professionalExperience).toEqual([]);
    expect(profile.relevantProjects).toEqual([]);
    expect(profile.skills).toEqual([]);
    expect(profile.certifications).toEqual([]);
  });

  test("fails closed when saved profile is unavailable", async () => {
    await expect(loadSavedProfile(clientFor(null).client, "caller")).rejects.toThrow("saved profile could not be loaded");
    await expect(loadSavedProfile(clientFor({}, { message: "offline" }).client, "caller")).rejects.toThrow("saved profile could not be loaded");
  });
});