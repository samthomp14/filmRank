interface CheckboxFilterProps {
  label: string
  options: string[]
  selectedOptions: string[]
  onSelectionChange: (selectedOptions: string[]) => void
  maxHeight?: string
}

export default function CheckboxFilter({
  label,
  options,
  selectedOptions,
  onSelectionChange,
  maxHeight = "max-h-40"
}: CheckboxFilterProps) {
  const handleCheckboxChange = (option: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedOptions, option])
    } else {
      onSelectionChange(selectedOptions.filter(item => item !== option))
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <div className={`space-y-1 ${maxHeight} overflow-y-auto border border-border rounded-lg p-3 bg-background`}>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No options available</p>
        ) : (
          options.map((option) => (
            <label key={option} className="flex items-center hover:bg-secondary p-1 rounded">
              <input
                type="checkbox"
                checked={selectedOptions.includes(option)}
                onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
              />
              <span className="ml-2 text-sm text-foreground truncate">{option}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
} 