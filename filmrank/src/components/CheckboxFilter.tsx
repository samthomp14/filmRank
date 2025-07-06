import React from 'react'

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
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className={`space-y-1 ${maxHeight} overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white`}>
        {options.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No options available</p>
        ) : (
          options.map((option) => (
            <label key={option} className="flex items-center hover:bg-gray-50 p-1 rounded">
              <input
                type="checkbox"
                checked={selectedOptions.includes(option)}
                onChange={(e) => handleCheckboxChange(option, e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700 truncate">{option}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
} 