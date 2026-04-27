"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  is_admin: boolean;
};

export type Organization = {
  id: string;
  name: string;
  legal_name: string;
  slug: string;
  logo_url: string | null;
  manager_id: string | null;
};

export type MemberRole =
  | "manager"
  | "grafik"
  | "projektmanagement"
  | "marketing"
  | "geschaeftsfuehrung"
  | "mitglied";

export type MembershipWithOrg = {
  id: string;
  organization_id: string;
  user_id: string;
  role: MemberRole;
  organization: Organization;
};

type SessionState = {
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  memberships: MembershipWithOrg[];
  activeOrg: Organization | null;
  activeRole: MemberRole | null;
  isManagerOfActive: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  setActiveOrg: (orgId: string | null) => void;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

const ACTIVE_ORG_KEY = "bs.activeOrgId";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithOrg[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);

  const loadProfileAndMemberships = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setMemberships([]);
      return;
    }

    const [profileRes, membersRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, full_name, is_admin")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("organization_members")
        .select(
          "id, organization_id, user_id, role, organization:organizations(id, name, legal_name, slug, logo_url, manager_id)"
        )
        .eq("user_id", user.id),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data as Profile);
    } else {
      setProfile(null);
    }

    const rows = (membersRes.data ?? []) as Array<{
      id: string;
      organization_id: string;
      user_id: string;
      role: MemberRole;
      organization: Organization | null;
    }>;
    const cleaned: MembershipWithOrg[] = rows
      .filter((r) => r.organization)
      .map((r) => ({
        id: r.id,
        organization_id: r.organization_id,
        user_id: r.user_id,
        role: r.role,
        organization: r.organization as Organization,
      }));
    setMemberships(cleaned);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadProfileAndMemberships(data.session?.user ?? null);
  }, [loadProfileAndMemberships]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      await loadProfileAndMemberships(data.session?.user ?? null);
      setLoading(false);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        await loadProfileAndMemberships(newSession?.user ?? null);
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfileAndMemberships]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ACTIVE_ORG_KEY);
      if (stored) setActiveOrgIdState(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (memberships.length === 0) {
      if (activeOrgId !== null) setActiveOrgIdState(null);
      return;
    }
    if (
      !activeOrgId ||
      !memberships.find((m) => m.organization_id === activeOrgId)
    ) {
      const first = memberships[0].organization_id;
      setActiveOrgIdState(first);
      try {
        window.localStorage.setItem(ACTIVE_ORG_KEY, first);
      } catch {
        // ignore
      }
    }
  }, [memberships, activeOrgId]);

  const setActiveOrg = useCallback((orgId: string | null) => {
    setActiveOrgIdState(orgId);
    try {
      if (orgId) window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
      else window.localStorage.removeItem(ACTIVE_ORG_KEY);
    } catch {
      // ignore
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setMemberships([]);
    setActiveOrg(null);
  }, [setActiveOrg]);

  const activeMembership = useMemo(
    () =>
      memberships.find((m) => m.organization_id === activeOrgId) ?? null,
    [memberships, activeOrgId]
  );

  const value = useMemo<SessionState>(
    () => ({
      loading,
      user: session?.user ?? null,
      session,
      profile,
      memberships,
      activeOrg: activeMembership?.organization ?? null,
      activeRole: activeMembership?.role ?? null,
      isManagerOfActive:
        !!activeMembership &&
        (activeMembership.role === "manager" ||
          activeMembership.organization.manager_id === session?.user?.id),
      refresh,
      signOut,
      setActiveOrg,
    }),
    [
      loading,
      session,
      profile,
      memberships,
      activeMembership,
      refresh,
      signOut,
      setActiveOrg,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession muss innerhalb von <SessionProvider> verwendet werden");
  }
  return ctx;
}
