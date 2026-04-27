"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const signOutInFlightRef = useRef(false);

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

    // Internal signOut tracking: nur bei einem vom User initiierten
    // Logout (siehe signOut() unten) wollen wir das nachfolgende
    // SIGNED_OUT-Event als echten Logout behandeln. Die supabase-js
    // Lib feuert `SIGNED_OUT` aber auch dann, wenn ein Refresh-Token
    // im Hintergrund mit einem (transienten) Fehler antwortet – z.B.
    // wenn ein Lock nach Tab-Idle gestohlen wurde. Diesen "False
    // Positive" wollen wir ignorieren.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (cancelled) return;

        if (event === "SIGNED_OUT") {
          if (signOutInFlightRef.current) {
            setSession(null);
            await loadProfileAndMemberships(null);
            return;
          }
          // Kein vom User initiierter Logout: prüfen, ob im
          // Storage wirklich keine Session mehr liegt. Wenn doch,
          // war es ein transienter Auth-Fehler und wir behalten die
          // alte Session.
          try {
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;
            if (data.session) {
              setSession(data.session);
              await loadProfileAndMemberships(data.session.user);
              return;
            }
          } catch {
            // Wenn getSession() nicht antwortet, bleibt die alte
            // Session aktiv – kein Hard-Logout.
            return;
          }
          setSession(null);
          await loadProfileAndMemberships(null);
          return;
        }

        if (!newSession) return;
        setSession(newSession);
        try {
          await loadProfileAndMemberships(newSession.user ?? null);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("[SessionProvider] auth change failed", err);
        }
      }
    );

    // Beim Zurückkommen in den Tab kann der eingebaute Auto-Refresh
    // hängen (Browser-Throttling im Hintergrund + Auth-Client-Locks).
    // Wir lesen daher selbst noch einmal die Session aus dem Storage –
    // mit hartem 3s-Timeout. Wichtig: bei Timeout / leerem Ergebnis
    // setzen wir die Session NICHT auf null. Lieber die alte Session
    // weiterverwenden, als den User aus Versehen "auszuloggen".
    const handleVisible = async () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      try {
        const result = await Promise.race<{
          data: { session: Session | null };
        } | null>([
          supabase.auth.getSession(),
          new Promise((resolve) => window.setTimeout(() => resolve(null), 3000)),
        ]);
        if (cancelled) return;
        const fetched = result?.data?.session ?? null;
        if (!fetched) return;
        setSession(fetched);
        await loadProfileAndMemberships(fetched.user);
      } catch (err) {
        // Hängender Lock o.ä. – einfach still die alte Session behalten.
        // eslint-disable-next-line no-console
        console.error("[SessionProvider] visibility refresh failed", err);
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
      subscription.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
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
    // Markiert das nachfolgende SIGNED_OUT-Event als echten Logout,
    // damit der onAuthStateChange-Handler ihn nicht als
    // transient-Auth-Fehler ignoriert.
    signOutInFlightRef.current = true;

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
