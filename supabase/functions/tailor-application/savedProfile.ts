// Client and extension snapshots are never evidence. Read the authenticated
// account's saved profile immediately before each tailoring run.
export async function loadSavedProfile(client: any, userId: string) {
  const { data: profile, error } = await client
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !profile) {
    throw new Error("Your saved profile could not be loaded. Please check Settings and try again.");
  }
  return {
    firstName: profile.first_name || "",
    lastName: profile.last_name || "",
    email: profile.email || "",
    phone: profile.phone || "",
    linkedin: profile.linkedin || "",
    github: profile.github || "",
    portfolio: profile.portfolio || "",
    coverLetter: profile.cover_letter || "",
    professionalExperience: Array.isArray(profile.professional_experience) ? profile.professional_experience : [],
    education: Array.isArray(profile.education) ? profile.education : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
    certificationsHidden: Boolean(profile.certifications_hidden),
    certifications: profile.certifications_hidden ? [] : profile.certifications || [],
    achievements: Array.isArray(profile.achievements) ? profile.achievements : [],
    atsStrategy: profile.ats_strategy || "",
    city: profile.city || "",
    country: profile.country || "",
    address: profile.address || "",
    state: profile.state || "",
    zipCode: profile.zip_code || "",
    relevantProjects: Array.isArray(profile.relevant_projects) ? profile.relevant_projects : [],
    languages: Array.isArray(profile.languages) ? profile.languages : [],
    citizenship: profile.citizenship || "",
    workAuthorizedCountries: Array.isArray(profile.work_authorized_countries) ? profile.work_authorized_countries : [],
    noticePeriod: profile.notice_period || "",
  };
}