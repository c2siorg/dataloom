import {
  LuArrowUpDown,
  LuCode,
  LuCopyMinus,
  LuDice5,
  LuEraser,
  LuFilter,
  LuGroup,
  LuLayoutList,
  LuRefreshCw,
  LuReplace,
  LuScissors,
  LuTable2,
} from "react-icons/lu";
import FilterForm from "../../forms/FilterForm";
import SortForm from "../../forms/SortForm";
import DropDuplicateForm from "../../forms/DropDuplicateForm";
import AdvQueryFilterForm from "../../forms/AdvQueryFilterForm";
import PivotTableForm from "../../forms/PivotTableForm";
import MeltForm from "../../forms/MeltForm";
import CastDataTypeForm from "../../forms/CastDataTypeForm";
import TrimWhitespaceForm from "../../forms/TrimWhitespaceForm";
import GroupByForm from "../../forms/GroupByForm";
import StringReplaceForm from "../../forms/StringReplaceForm";
import FillEmptyForm from "../../forms/FillEmptyForm";
import SampleRowsForm from "../../forms/SampleRowsForm";
import { registerFeature } from "../featureRegistry";

/**
 * Transforms feature — the docked transform forms and their Data-ribbon menu.
 * Each form is both a panel (opened via togglePanel) and a menu item that toggles
 * it; the menu label may differ from the panel title (e.g. "Drop Dup" vs "Drop
 * Duplicates"), matching the pre-registry ribbon exactly.
 */
registerFeature({
  id: "transforms",
  panels: [
    { name: "FilterForm", title: "Filter", component: FilterForm },
    { name: "SampleRowsForm", title: "Sample", component: SampleRowsForm },
    { name: "SortForm", title: "Sort", component: SortForm },
    { name: "DropDuplicateForm", title: "Drop Duplicates", component: DropDuplicateForm },
    { name: "GroupByForm", title: "Group By", component: GroupByForm },
    { name: "CastDataTypeForm", title: "Cast Type", component: CastDataTypeForm },
    { name: "TrimWhitespaceForm", title: "Trim Whitespace", component: TrimWhitespaceForm },
    { name: "StringReplaceForm", title: "Replace", component: StringReplaceForm },
    { name: "FillEmptyForm", title: "Fill Empty", component: FillEmptyForm },
    { name: "AdvQueryFilterForm", title: "Advanced Query", component: AdvQueryFilterForm },
    { name: "PivotTableForm", title: "Pivot Table", component: PivotTableForm },
    { name: "MeltForm", title: "Melt (Unpivot)", component: MeltForm },
  ],
  menu: [
    // Data ▸ Transform
    { ribbon: "Data", group: "Transform", order: 0, label: "Filter", icon: LuFilter, action: { togglePanel: "FilterForm" }, disabledInPreview: true, activePanel: "FilterForm" },
    { ribbon: "Data", group: "Transform", order: 1, label: "Sample", icon: LuDice5, action: { togglePanel: "SampleRowsForm" }, disabledInPreview: true, activePanel: "SampleRowsForm" },
    { ribbon: "Data", group: "Transform", order: 2, label: "Sort", icon: LuArrowUpDown, action: { togglePanel: "SortForm" }, disabledInPreview: true, activePanel: "SortForm" },
    { ribbon: "Data", group: "Transform", order: 3, label: "Drop Dup", icon: LuCopyMinus, action: { togglePanel: "DropDuplicateForm" }, disabledInPreview: true, activePanel: "DropDuplicateForm" },
    { ribbon: "Data", group: "Transform", order: 4, label: "GroupBy", icon: LuGroup, action: { togglePanel: "GroupByForm" }, disabledInPreview: true, activePanel: "GroupByForm" },
    { ribbon: "Data", group: "Transform", order: 5, label: "Cast Type", icon: LuRefreshCw, action: { togglePanel: "CastDataTypeForm" }, disabledInPreview: true, activePanel: "CastDataTypeForm" },
    { ribbon: "Data", group: "Transform", order: 6, label: "Trim Space", icon: LuScissors, action: { togglePanel: "TrimWhitespaceForm" }, disabledInPreview: true, activePanel: "TrimWhitespaceForm" },
    { ribbon: "Data", group: "Transform", order: 7, label: "Replace", icon: LuReplace, action: { togglePanel: "StringReplaceForm" }, disabledInPreview: true, activePanel: "StringReplaceForm" },
    { ribbon: "Data", group: "Transform", order: 8, label: "Fill Empty", icon: LuEraser, action: { togglePanel: "FillEmptyForm" }, disabledInPreview: true, activePanel: "FillEmptyForm" },
    // Data ▸ Query
    { ribbon: "Data", group: "Query", order: 0, label: "Adv Query", icon: LuCode, action: { togglePanel: "AdvQueryFilterForm" }, disabledInPreview: true, activePanel: "AdvQueryFilterForm" },
    { ribbon: "Data", group: "Query", order: 1, label: "Pivot Table", icon: LuTable2, action: { togglePanel: "PivotTableForm" }, disabledInPreview: true, activePanel: "PivotTableForm" },
    { ribbon: "Data", group: "Query", order: 2, label: "Melt (Unpivot)", icon: LuLayoutList, action: { togglePanel: "MeltForm" }, disabledInPreview: true, activePanel: "MeltForm" },
  ],
});
