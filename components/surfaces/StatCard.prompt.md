# StatCard

Dashboard metric widget: `label`, `value`, `unit`, `delta`, optional `spark` + `icon`. Use `deltaMode="finance"` for Taiwan 紅漲綠跌.

```jsx
<StatCard label="加權指數" value="23,412" delta="+1.2%" deltaMode="finance"
          spark={<Sparkline data={[3,5,4,7,6,9]} />} tone="insight" />
```

Ships `Sparkline({ data, width, height, color })` alongside.
