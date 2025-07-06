import React from 'react'

interface RangeFilterProps {
  label: string
  min: number
  max: number
  onRangeChange: (min: number, max: number) => void
  step?: number
  placeholder?: {
    min: string
    max: string
  }
  defaultValue?: {
    min: number
    max: number
  }
}

export default function RangeFilter({
  label,
  min,
  max,
  onRangeChange,
  step = 1,
  placeholder = { min: "Min", max: "Max" },
  defaultValue
}: RangeFilterProps) {
  const handleMinChange = (value: string) => {
    const numValue = value === '' ? (defaultValue?.min || 0) : parseInt(value) || (defaultValue?.min || 0)
    onRangeChange(numValue, max)
  }

  const handleMaxChange = (value: string) => {
    const numValue = value === '' ? (defaultValue?.max || 100) : parseInt(value) || (defaultValue?.max || 100)
    onRangeChange(min, numValue)
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2 items-center min-w-0">
        <input
          type="number"
          step={step}
          placeholder={placeholder.min}
          value={min}
          onChange={(e) => handleMinChange(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <span className="text-gray-500 flex-shrink-0">to</span>
        <input
          type="number"
          step={step}
          placeholder={placeholder.max}
          value={max}
          onChange={(e) => handleMaxChange(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  )
} 