import React from 'react';
import { Search, X } from 'lucide-react';

export const SearchFilterBar = ({
  searchQuery,
  onSearchChange,
  authFilter,
  onAuthFilterChange,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  authFilter: 'all' | 'oauth' | 'keys';
  onAuthFilterChange: (filter: 'all' | 'oauth' | 'keys') => void;
}) => {
  return (
    <div className="flex items-center gap-2 sm:gap-4 pb-4 pt-2">
      <div className="flex-1 max-w-md">
        <div className="relative group">
          <input
            type="text"
            placeholder="Search 1000+ apps..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 w-full rounded-2xl border border-input bg-card px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
            <Search className="h-4 w-4" />
          </div>
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/30 p-1">
        {(['oauth', 'keys', 'all'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => onAuthFilterChange(filter)}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
              authFilter === filter
                ? 'bg-background text-foreground border border-border/50'
                : 'text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            {filter === 'oauth' ? 'OAuth' : filter === 'keys' ? 'API Key' : 'All'}
          </button>
        ))}
      </div>
    </div>
  );
};
