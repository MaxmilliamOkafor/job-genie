import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

import { normalizeWorkExperience } from '@/lib/workExperienceNormalization';

export interface Profile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  citizenship: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  current_salary: string | null;
  expected_salary: string | null;
  notice_period: string | null;
  total_experience: string | null;
  highest_education: string | null;
  willing_to_relocate: boolean;
  driving_license: boolean;
  visa_required: boolean;
  authorized_countries: string[];
  veteran_status: boolean;
  disability: boolean;
  race_ethnicity: string | null;
  gender: string | null;
  hispanic_latino: boolean;
  security_clearance: boolean;
  cover_letter: string | null;
  professional_experience: any[];
  relevant_projects: any[];
  education: any[];
  skills: any[];
  certifications: string[];
  languages: any[];
  achievements: any[];
  excluded_companies: string[];
  ats_strategy: string | null;
  cv_file_path: string | null;
  cv_file_name: string | null;
  cv_uploaded_at: string | null;
  openai_api_key: string | null;
  kimi_api_key: string | null;
  preferred_ai_provider: string | null;
  openai_enabled: boolean;
  kimi_enabled: boolean;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        const rawWorkExp = Array.isArray(data.professional_experience) ? (data.professional_experience as any[]) : [];
        const normalizedWorkExp = normalizeWorkExperience(rawWorkExp as any);

        // One-time auto-repair: if older data has company/title swapped or missing ids/bullets,
        // normalise it and persist so UI + PDF stay consistent.
        if (JSON.stringify(rawWorkExp) !== JSON.stringify(normalizedWorkExp)) {
          supabase
            .from('profiles')
            .update({ professional_experience: normalizedWorkExp } as any)
            .eq('user_id', user.id)
            .then(({ error }) => {
              if (error) console.warn('Failed to auto-normalise work experience:', error.message);
            });
        }

        setProfile({
          ...data,
          authorized_countries: (data.authorized_countries as string[]) || [],
          professional_experience: normalizedWorkExp,
          relevant_projects: Array.isArray((data as any).relevant_projects) ? (data as any).relevant_projects : [],
          education: Array.isArray(data.education) ? data.education : [],
          skills: Array.isArray(data.skills) ? data.skills : [],
          certifications: (data.certifications as string[]) || [],
          languages: Array.isArray(data.languages) ? data.languages : [],
          achievements: Array.isArray(data.achievements) ? data.achievements : [],
          excluded_companies: (data.excluded_companies as string[]) || [],
          cv_file_path: data.cv_file_path || null,
          cv_file_name: data.cv_file_name || null,
          cv_uploaded_at: data.cv_uploaded_at || null,
          gender: data.gender || null,
          hispanic_latino: data.hispanic_latino ?? false,
          openai_api_key: (data as any).openai_api_key || null,
          kimi_api_key: (data as any).kimi_api_key || null,
          preferred_ai_provider: (data as any).preferred_ai_provider || 'openai',
          openai_enabled: (data as any).openai_enabled ?? true,
          kimi_enabled: (data as any).kimi_enabled ?? true,
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user || !profile) return;

    try {
      const safeUpdates: Partial<Profile> = {
        ...updates,
        ...(updates.professional_experience ? { professional_experience: normalizeWorkExperience(updates.professional_experience as any) } : {}),
      };

      const { error } = await supabase
        .from('profiles')
        .update(safeUpdates)
        .eq('user_id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...safeUpdates } : null);
      toast.success('Profile updated');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  return {
    profile,
    isLoading,
    updateProfile,
    refetch: fetchProfile,
  };
}
