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

    try {
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

      if (profileRes.error) {
        // Tabelle/Spalte fehlt? Kein harter Fehler, einfach ohne Profil
        // weiterlaufen, damit die UI nicht in "Lade …" hängen bleibt.
        // eslint-disable-next-line no-console
        console.warn("[SessionProvider] profile load:", profileRes.error.message);
      }
      if (membersRes.error) {
        // eslint-disable-next-line no-console
        console.warn(
          "[SessionProvider] memberships load:",
          membersRes.error.message
        );
      }

      setProfile(
        profileRes.data
          ? (profileRes.data as Profile)
          : ({
              id: user.id,
              username: null,
              full_name: null,
              is_admin: false,
            } satisfies Profile)
      );

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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[SessionProvider] loadProfileAndMemberships failed", err);
      setProfile({
        id: user.id,
        username: null,
        full_name: null,
        is_admin: false,
      });
      setMemberships([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      await loadProfileAndMemberships(data.session?.user ?? null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[SessionProvider] refresh failed", err);
    }
  }, [loadProfileAndMemberships]);

  useEffect(() => {
    let cancelled = false;

    // Notnagel: spätestens nach 6s freigeben, damit die UI niemals
    // dauerhaft in "Lade …" hängen bleibt – auch wenn getSession() aus
    // irgendeinem Grund nicht zurückkehren sollte.
    const safety = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 6000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        await loadProfileAndMemberships(data.session?.user ?? null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[SessionProvider] init failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (cancelled) return;
        setSession(newSession);
        try {
          await loadProfileAndMemberships(newSession?.user ?? null);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[SessionProvider] auth change failed", err);
        }
      }
    );

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
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
    // Lokalen State zuerst leeren, damit die UI auch dann sauber
    // umschaltet, wenn supabase.auth.signOut() langsam ist oder hängt.
    setSession(null);
    setProfile(null);
    setMemberships([]);
    setActiveOrg(null);

    // Persistenten Auth-Cache aus dem localStorage räumen, falls der
    // signOut-Call hängen bleibt – sonst wäre der User beim nächsten
    // Reload wieder eingeloggt.
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (
          key &&
          (key.startsWith("sb-") ||
            key.startsWith("supabase.auth.") ||
            key === "supabase.auth.token")
        ) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }

    // Den eigentlichen Server-Signout gegen ein 3s-Timeout rennen lassen.
    await Promise.race([
      supabase.auth.signOut().catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
    ]);
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
