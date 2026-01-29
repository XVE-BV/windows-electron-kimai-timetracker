import * as React from "react"
import { Check, ChevronsUpDown, Search, Star } from "lucide-react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "../../lib/utils"

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "start", sideOffset = 4, side = "bottom", ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      side={side}
      sideOffset={sideOffset}
      className={cn(
        "z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

// Combobox component
interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  favoriteIds?: string[]
  onToggleFavorite?: (id: string) => void
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled = false,
  className,
  favoriteIds = [],
  onToggleFavorite,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  const filteredOptions = React.useMemo(() => {
    let filtered = options
    if (search) {
      filtered = options.filter((option) =>
        option.label.toLowerCase().includes(search.toLowerCase())
      )
    }
    return filtered
  }, [options, search])

  // Separate favorites and non-favorites
  const { favorites, others } = React.useMemo(() => {
    const favs: ComboboxOption[] = []
    const rest: ComboboxOption[] = []

    filteredOptions.forEach((option) => {
      // Skip 'none' option from favorites grouping
      if (option.value === 'none') {
        rest.unshift(option) // Keep 'none' at the top of others
      } else if (favoriteIds.includes(option.value)) {
        favs.push(option)
      } else {
        rest.push(option)
      }
    })

    return { favorites: favs, others: rest }
  }, [filteredOptions, favoriteIds])

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue)
    setOpen(false)
    setSearch("")
  }

  const handleToggleFavorite = (e: React.MouseEvent, optionValue: string) => {
    e.stopPropagation()
    onToggleFavorite?.(optionValue)
  }

  const renderOption = (option: ComboboxOption, showFavoriteStar: boolean) => {
    const isFavorite = favoriteIds.includes(option.value)
    const canFavorite = option.value !== 'none' && onToggleFavorite

    return (
      <button
        key={option.value}
        type="button"
        className={cn(
          "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
          value === option.value && "bg-accent text-accent-foreground"
        )}
        onClick={() => handleSelect(option.value)}
      >
        <Check
          className={cn(
            "mr-2 h-4 w-4 flex-shrink-0",
            value === option.value ? "opacity-100" : "opacity-0"
          )}
        />
        <span className="flex-1 truncate text-left">{option.label}</span>
        {canFavorite && showFavoriteStar && (
          <button
            type="button"
            className="ml-2 p-0.5 hover:bg-muted rounded flex-shrink-0"
            onClick={(e) => handleToggleFavorite(e, option.value)}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
              )}
            />
          </button>
        )}
      </button>
    )
  }

  const hasFavorites = favorites.length > 0

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) setSearch("")
    }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0" side="bottom" avoidCollisions={false}>
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : (
            <>
              {/* Favorites section */}
              {hasFavorites && (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    Favorites
                  </div>
                  {favorites.map((option) => renderOption(option, true))}
                  <div className="my-1 border-t" />
                </>
              )}
              {/* Other options */}
              {others.map((option) => renderOption(option, true))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
}
