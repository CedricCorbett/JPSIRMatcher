import { NavLink } from 'react-router-dom'
import { LayoutDashboard, UserPlus, Globe, Shield, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../App.tsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/new', icon: UserPlus, label: 'New Physician' },
  { to: '/sites', icon: Globe, label: 'My Sites' },
]

const adminItem = { to: '/admin', icon: Shield, label: 'Admin Panel' }

export default function Layout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const allNavItems = profile?.role === 'admin' ? [...navItems, adminItem] : navItems

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Nav */}
      <header className="h-14 border-b border-border bg-bg-secondary/80 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-text-secondary hover:text-text-primary transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <NavLink to="/" className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-gold">PhysMatch</span>
          </NavLink>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary hidden sm:block">
            {profile?.full_name || 'Recruiter'}
          </span>
          <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold text-sm font-medium">
            {(profile?.full_name || 'U').charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — Desktop */}
        <aside className="hidden md:flex w-56 border-r border-border bg-bg-secondary/50 flex-col shrink-0">
          <nav className="flex-1 py-4 px-3 space-y-1">
            {allNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                    isActive
                      ? 'bg-gold/10 text-gold font-medium'
                      : 'text-text-secondary hover:bg-bg-card-hover hover:text-text-primary'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                    )}
                    <item.icon className={clsx('w-4 h-4 shrink-0', !isActive && 'ml-[14px]')} />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="p-3 border-t border-border">
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-card-hover hover:text-red w-full transition-all duration-200"
            >
              <LogOut className="w-4 h-4 ml-[14px]" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-20 bg-black/50" onClick={() => setMobileOpen(false)}>
            <aside
              className="w-64 h-full bg-bg-secondary border-r border-border flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <nav className="flex-1 py-4 px-3 space-y-1 mt-14">
                {allNavItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200',
                        isActive
                          ? 'bg-gold/10 text-gold font-medium'
                          : 'text-text-secondary hover:bg-bg-card-hover hover:text-text-primary'
                      )
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="p-3 border-t border-border">
                <button
                  onClick={signOut}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-bg-card-hover hover:text-red w-full transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-secondary/95 backdrop-blur-sm border-t border-border flex items-center justify-around z-20">
        {allNavItems.slice(0, 4).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] transition-colors',
                isActive ? 'text-gold' : 'text-text-muted'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
