/**
 * Thin navigation adapter: exposes the small routing surface the Report-Advisor
 * screens were written against (Routes/Route/Link/useNavigate/useLocation/
 * useParams/useSearchParams) on top of TanStack Router's history.
 */
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

type To = string | { pathname?: string; search?: string; hash?: string };
type NavOpts = { replace?: boolean; state?: unknown };

function toHref(to: To): string {
  if (typeof to === "string") return to;
  return `${to.pathname ?? ""}${to.search ?? ""}${to.hash ?? ""}`;
}

function resolveHref(to: To, current: string): string {
  const href = toHref(to);
  if (href.startsWith("/") || /^[a-z]+:/i.test(href)) return href;
  if (href.startsWith("?") || href.startsWith("#")) return current + href;
  const base = current.endsWith("/") ? current : current.replace(/[^/]*$/, "");
  return base + href;
}

export function useLocation() {
  const loc = useRouterState({ select: (s) => s.location });
  return useMemo(
    () => ({
      pathname: loc.pathname,
      search: loc.searchStr ?? "",
      hash: loc.hash ? `#${loc.hash}` : "",
      state: (loc.state as { __compat?: unknown } | undefined)?.__compat ?? null,
      key: (loc.state as { key?: string } | undefined)?.key ?? "default",
    }),
    [loc],
  );
}

export function useNavigate() {
  const router = useRouter();
  const { pathname } = useLocation();
  return useCallback(
    (to: To | number, opts?: NavOpts) => {
      if (typeof to === "number") {
        router.history.go(to);
        return;
      }
      const href = resolveHref(to, pathname);
      const state = { __compat: opts?.state } as never;
      if (opts?.replace) router.history.replace(href, state);
      else router.history.push(href, state);
    },
    [router, pathname],
  );
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: To;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
};

export function Link({ to, replace, state, onClick, target, ...rest }: LinkProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const href = resolveHref(to, pathname);
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== "_self") return;
    if (/^[a-z]+:/i.test(href)) return;
    e.preventDefault();
    navigate(href, { replace, state });
  };
  return <a href={href} target={target} onClick={handle} {...rest} />;
}

export function Navigate({ to, replace }: { to: To; replace?: boolean }) {
  const navigate = useNavigate();
  queueMicrotask(() => navigate(to, { replace }));
  return null;
}

export function BrowserRouter({ children }: { children: ReactNode; basename?: string }) {
  return <>{children}</>;
}

const ParamsContext = createContext<Record<string, string>>({});

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  return useContext(ParamsContext) as T;
}

export function Route(_props: { path?: string; element?: ReactNode; index?: boolean }): ReactElement | null {
  return null;
}

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const clean = (s: string) => s.replace(/\/+$/, "") || "/";
  const p = clean(pattern);
  const path = clean(pathname);
  if (p === "*" || p === "/*") return {};
  const pSeg = p.split("/").filter(Boolean);
  const seg = path.split("/").filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < pSeg.length; i++) {
    const ps = pSeg[i]!;
    if (ps === "*") {
      params["*"] = seg.slice(i).join("/");
      return params;
    }
    const s = seg[i];
    if (s === undefined) return null;
    if (ps.startsWith(":")) params[ps.slice(1)] = decodeURIComponent(s);
    else if (ps !== s) return null;
  }
  return seg.length === pSeg.length ? params : null;
}

export function Routes({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  let matched: ReactNode = null;
  let params: Record<string, string> = {};
  Children.forEach(children, (child) => {
    if (matched !== null || !isValidElement(child)) return;
    const props = child.props as { path?: string; index?: boolean; element?: ReactNode };
    const m = matchPath(props.index ? "/" : props.path ?? "*", pathname);
    if (m) {
      matched = props.element ?? null;
      params = m;
    }
  });
  return <ParamsContext.Provider value={params}>{matched}</ParamsContext.Provider>;
}

export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams), opts?: NavOpts) => void,
] {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const set = useCallback(
    (next: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams), opts?: NavOpts) => {
      const value = typeof next === "function" ? next(new URLSearchParams(search)) : next;
      const sp = value instanceof URLSearchParams ? value : new URLSearchParams(value);
      const qs = sp.toString();
      navigate(`${pathname}${qs ? `?${qs}` : ""}`, opts);
    },
    [navigate, pathname, search],
  );
  return [params, set];
}
