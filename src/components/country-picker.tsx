import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { COUNTRIES, flagOf, findCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";

export function CountryPicker({ value, onChange, placeholder = "Select country" }: { value: string; onChange: (name: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const sel = findCountry(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {sel ? (
            <span className="flex items-center gap-2"><span className="text-base leading-none">{flagOf(sel.code)}</span>{sel.name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search countries..." />
          <CommandList className="max-h-72">
            <CommandEmpty>No countries found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.code}`}
                  onSelect={() => { onChange(c.name); setOpen(false); }}
                >
                  <span className="mr-2 text-base leading-none">{flagOf(c.code)}</span>
                  <span>{c.name}</span>
                  <Check className={cn("ml-auto h-4 w-4", sel?.code === c.code ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
