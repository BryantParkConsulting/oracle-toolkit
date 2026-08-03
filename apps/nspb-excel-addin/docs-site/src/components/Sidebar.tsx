import type { LucideIcon } from 'lucide-react';
import { BookOpen, Wrench, Settings as SettingsIcon, Compass, ExternalLink, Sparkles, Map, Briefcase } from 'lucide-react';
import type { ArticlePath } from '../App';

interface SidebarProps {
  activeArticle: ArticlePath;
  setActiveArticle: (path: ArticlePath) => void;
}

interface NavItem {
  id: ArticlePath;
  label: string;
  icon: LucideIcon;
  href?: string;          // when present, item is an external link (opens in new tab)
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'NSPB Assistant',
    items: [
      { id: '/help/OVERVIEW.md',  label: 'Overview',         icon: Compass },
      { id: '/help/USE_CASES.md',    label: 'Use cases',          icon: Sparkles },
      { id: '/help/BPC_SERVICES.md', label: 'What BPC can build',  icon: Briefcase },
      { id: '/help/ROADMAP.md',      label: 'Roadmap',            icon: Map },
      { id: '/help/INSTALL.md',   label: 'Install (IT)',     icon: Wrench },
      { id: '/help/SETUP.md',     label: 'Set up the chat',  icon: SettingsIcon },
      { id: '/help/USE.md',       label: 'User guide',       icon: BookOpen },
    ]
  }
];

export default function Sidebar({ activeArticle, setActiveArticle }: SidebarProps) {
  return (
    <div className="topics-sidebar">
      <div className="sidebar-title" style={{ padding: '20px 20px 10px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
         <BookOpen size={16} /> Navigation
      </div>
      <div style={{ overflowY: 'auto', padding: '0 10px 20px' }}>
        {navGroups.map((group) => (
          <div key={group.title} className="tree-group" style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.5px', padding: '0 8px 8px' }}>
              {group.title}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeArticle === item.id;
              const baseStyle: React.CSSProperties = {
                display: 'flex',
                gap: '6px',
                cursor: 'pointer',
                color: isActive ? 'var(--accent)' : 'inherit',
                fontWeight: isActive ? 700 : 'normal',
                padding: '6px 8px',
                borderRadius: '6px',
                backgroundColor: isActive ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                transition: 'all 0.2s ease',
                alignItems: 'center',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                marginBottom: '6px',
                textDecoration: 'none'
              };
              if (item.href) {
                // External link — open in new tab
                return (
                  <a
                    key={item.id}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tree-node"
                    style={baseStyle}
                  >
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <Icon size={14} />
                    </div>
                    <span style={{ fontSize: '0.85rem', lineHeight: '1.2', flex: '1 1 auto', wordBreak: 'break-word', paddingRight: '4px' }}>
                      {item.label}
                    </span>
                    <ExternalLink size={11} style={{ opacity: 0.45, flexShrink: 0 }} />
                  </a>
                );
              }
              return (
                <div
                  key={item.id}
                  className={`tree-node ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveArticle(item.id)}
                  style={baseStyle}
                >
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    <Icon size={14} />
                  </div>
                  <span style={{ fontSize: '0.85rem', lineHeight: '1.2', flex: '1 1 auto', wordBreak: 'break-word', paddingRight: '4px' }}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
