# Button

Primary action control. Aurora-gradient `primary`, plus `secondary`, `outline`, `ghost`, `danger`.

```jsx
<Button variant="primary" iconRight={<Arrow/>}>訂閱報報</Button>
<Button variant="secondary" size="sm">查看歷史</Button>
<Button loading>載入中</Button>
```

- Sizes: `sm` / `md` / `lg`. `block` fills width.
- Pass `icon` / `iconRight` for leading/trailing glyphs.
- `loading` shows a spinner and disables interaction.
