# Tabs

Segmented (pill) or underline tab control. Pass `items` `[{id,label,icon}]`.

```jsx
<Tabs items={[{id:"day",label:"日報"},{id:"week",label:"週報"},{id:"month",label:"月報"}]}
      defaultValue="week" onChange={setTab} />
<Tabs variant="underline" items={items} value={tab} onChange={setTab} />
```
