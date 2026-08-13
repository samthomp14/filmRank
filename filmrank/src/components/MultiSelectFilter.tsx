import { useState, useRef, useEffect } from 'react'

interface MultiSelectFilterProps {
  label: string
  options: string[]
  selectedOptions: string[]
  onSelectionChange: (selectedOptions: string[]) => void
  placeholder?: string
  maxDisplayed?: number
}

export default function MultiSelectFilter({
  label,
  options,
  selectedOptions,
  onSelectionChange,
  placeholder = "Select options...",
  maxDisplayed = 3
}: MultiSelectFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !selectedOptions.includes(option)
  )

  const handleOptionToggle = (option: string) => {
    if (selectedOptions.includes(option)) {
      onSelectionChange(selectedOptions.filter(item => item !== option))
    } else {
      onSelectionChange([...selectedOptions, option])
    }
  }

  const removeOption = (option: string) => {
    onSelectionChange(selectedOptions.filter(item => item !== option))
  }

  const displayedSelected = selectedOptions.slice(0, maxDisplayed)
  const remainingCount = selectedOptions.length - maxDisplayed

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      {/* Selected Options Display */}
      {selectedOptions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {displayedSelected.map((option) => (
            <span
              key={option}
              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/15 text-primary"
            >
              {option}
              <button
                onClick={() => removeOption(option)}
                className="ml-1 text-primary hover:text-primary/70 focus:outline-none"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
          {remainingCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-secondary text-muted-foreground">
              +{remainingCount} more
            </span>
          )}
        </div>
      )}
      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary relative"
      >
        <span className={selectedOptions.length === 0 ? "text-muted-foreground" : "text-foreground"}>
          {selectedOptions.length === 0 ? placeholder : `${selectedOptions.length} selected`}
        </span>
        <svg
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-border bg-background rounded focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          {/* Options List */}
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {searchTerm ? 'No options found' : 'No options available'}
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleOptionToggle(option)}
                  className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-secondary focus:outline-none focus:bg-secondary"
                >
                  {option}
                </button>
              ))
            )}
          </div>
          {/* Clear All Button */}
          {selectedOptions.length > 0 && (
            <div className="p-2 border-t border-border">
              <button
                type="button"
                onClick={() => onSelectionChange([])}
                className="w-full px-2 py-1 text-sm text-destructive hover:bg-destructive/10 rounded focus:outline-none"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
} 