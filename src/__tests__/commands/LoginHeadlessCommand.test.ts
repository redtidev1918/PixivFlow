import { LoginHeadlessCommand } from '../../commands/LoginHeadlessCommand';

describe('LoginHeadlessCommand', () => {
  const command = new LoginHeadlessCommand();

  describe('validate', () => {
    it('passes with username and password', () => {
      const result = command.validate({
        options: { u: 'user@example.com', p: 'secret' },
        positional: [],
      });
      expect(result.valid).toBe(true);
    });

    it('passes with --password-stdin and no password flag', () => {
      const result = command.validate({
        options: { u: 'user@example.com', 'password-stdin': true },
        positional: [],
      });
      expect(result.valid).toBe(true);
    });

    it('fails without password and without --password-stdin', () => {
      const result = command.validate({
        options: { u: 'user@example.com' },
        positional: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/password/i);
    });

    it('fails without username', () => {
      const result = command.validate({
        options: { p: 'secret' },
        positional: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/username/i);
    });
  });
});
