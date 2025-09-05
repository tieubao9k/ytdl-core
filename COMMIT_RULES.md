# Git Commit Rules for ytdl-core

## Commit Message Format
```
<type>(<scope>): <subject>

<body>

Updated by: Satoru FX
```

## Types
- `feat`: New feature
- `fix`: Bug fix  
- `perf`: Performance improvement
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Build/dependency updates

## Examples

### Feature Addition
```
feat(android): add cookie support for age-restricted videos

• Add cookie header processing in requestOptions
• Support VISITOR_INFO1_LIVE and SESSION_TOKEN cookies
• Add comprehensive documentation with examples
• Maintain backward compatibility

Updated by: Satoru FX
```

### Bug Fix
```
fix(signature): resolve 403 errors with enhanced headers

• Update Android client User-Agent string
• Add proper Origin and Referer headers
• Improve request authentication flow
• Test with multiple video types

Updated by: Satoru FX
```

### Performance Improvement
```
perf(download): optimize connection pooling for 20% speed boost

• Implement Keep-Alive connections
• Add concurrent chunk downloading
• Optimize buffer management
• Benchmark results: 17% -> 20% improvement

Updated by: Satoru FX
```

### Documentation Update
```
docs(readme): add cookie usage examples and troubleshooting

• Add English and Vietnamese cookie examples
• Include browser extraction instructions
• Update API reference with new options
• Add troubleshooting section for common issues

Updated by: Satoru FX
```

## Rules

### ✅ Always Include
- Clear, descriptive subject line
- Detailed body explaining changes
- "Updated by: Satoru FX" footer
- Bullet points for multiple changes

### ❌ Never Include
- Co-authored-by lines
- Generated with Claude Code lines
- External contributor references
- Generic commit messages

### 📋 Best Practices
1. **Subject line**: Max 50 characters, start with lowercase verb
2. **Body**: Explain WHAT and WHY, not just HOW
3. **Breaking changes**: Mark with BREAKING: in body
4. **Issue references**: Include when fixing specific issues
5. **Test results**: Include when relevant (performance, compatibility)

## Version Bumping
- **Patch** (x.x.1): Bug fixes, small improvements
- **Minor** (x.1.x): New features, significant enhancements  
- **Major** (1.x.x): Breaking changes

## Pre-commit Checklist
- [ ] Code tested and working
- [ ] Documentation updated if needed
- [ ] No breaking changes (unless intentional)
- [ ] Commit message follows format
- [ ] "Updated by: Satoru FX" included