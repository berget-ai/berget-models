import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  Cpu, 
  Key, 
  Users, 
  Settings, 
  HelpCircle, 
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import BergetLogo from './BergetLogo';
import { useState } from 'react';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
}

const menuItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'support', label: 'Support', icon: HelpCircle },
  { id: 'api-docs', label: 'API Docs', icon: FileText },
];

export default function Sidebar({ activeItem, onItemClick }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} h-full bg-background border-r border-border/50 transition-all duration-300 ease-in-out`}>
      <div className="flex flex-col h-full">
        {/* Logo and collapse toggle */}
        <div className="p-4 flex items-center justify-between border-b border-border/30">
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <BergetLogo size={24} />
              <span className="text-lg font-semibold text-foreground">Berget AI</span>
            </div>
          )}
          {isCollapsed && (
            <div className="flex justify-center w-full">
              <BergetLogo size={24} />
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 p-0 hover:bg-muted/50"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "secondary" : "ghost"}
                  className={`
                    w-full ${isCollapsed ? 'px-0' : 'justify-start px-3'} h-10
                    ${isActive 
                      ? 'bg-muted/50 text-foreground border border-border/30' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                    }
                  `}
                  onClick={() => onItemClick(item.id)}
                >
                  <Icon className={`h-4 w-4 ${isCollapsed ? '' : 'mr-3'}`} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}