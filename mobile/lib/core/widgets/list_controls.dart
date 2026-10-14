import 'dart:async';

import 'package:flutter/material.dart';
import 'package:opencrm/core/theme/app_colors.dart';
import 'package:opencrm/core/theme/app_spacing.dart';

/// The search box above a list. It reports what was typed a moment after the typing
/// stops, so a list does not ask the server on every key.
class SearchField extends StatefulWidget {
  const SearchField({
    super.key,
    required this.hint,
    required this.onChanged,
    this.initialValue = '',
  });

  /// "Search leads": also what a screen reader calls the field.
  final String hint;
  final ValueChanged<String> onChanged;
  final String initialValue;

  static const debounce = Duration(milliseconds: 350);

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialValue,
  );
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _changed(String value) {
    _timer?.cancel();
    _timer = Timer(SearchField.debounce, () => widget.onChanged(value));
    setState(() {});
  }

  void _clear() {
    _timer?.cancel();
    _controller.clear();
    widget.onChanged('');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onChanged: _changed,
      textInputAction: TextInputAction.search,
      // The API's limit for a search.
      maxLength: 100,
      decoration: InputDecoration(
        hintText: widget.hint,
        counterText: '',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: _controller.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Clear search',
                icon: const Icon(Icons.close),
                onPressed: _clear,
              ),
      ),
    );
  }
}

/// One chip of a [FilterChipBar].
class FilterOption<T> {
  const FilterOption({required this.value, required this.label});

  final T value;
  final String label;
}

/// A row of chips that picks one value (a status filter, a timeline filter). It scrolls
/// sideways on its own when the chips do not fit, so the page never does.
class FilterChipBar<T> extends StatelessWidget {
  const FilterChipBar({
    super.key,
    required this.label,
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  /// What the group is, for a screen reader: "Filter by status".
  final String label;
  final List<FilterOption<T>> options;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    // Chips that fit start at the left edge, like the rest of the page, instead of being
    // centred by a wide screen.
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: _chips(context),
    );
  }

  Widget _chips(BuildContext context) {
    return Semantics(
      container: true,
      label: label,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final option in options)
              Padding(
                padding: const EdgeInsets.only(right: AppSpacing.sm),
                child: ChoiceChip(
                  label: Text(option.label),
                  selected: option.value == selected,
                  // The chip is 32 high; this makes the touch target 48.
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                  labelStyle: TextStyle(
                    color: option.value == selected
                        ? context.colors.onPrimary
                        : context.colors.text,
                    fontWeight: FontWeight.w500,
                  ),
                  onSelected: (_) => onSelected(option.value),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
