export interface CreateModifierGroupDto {
  name: string;
  min_selected: number;
  max_selected: number;
}

export interface UpdateModifierGroupDto {
  name?: string;
  min_selected?: number;
  max_selected?: number;
}

export interface CreateModifierOptionDto {
  name: string;
  extra_price_byn: number;
  is_default: boolean;
}

export interface UpdateModifierOptionDto {
  name?: string;
  extra_price_byn?: number;
  is_default?: boolean;
}

export interface StopListChangedEvent {
  itemId: string;
  isInStopList: boolean;
}
